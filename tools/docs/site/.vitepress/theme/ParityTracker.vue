<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, onMounted, ref } from 'vue';

import type { TrackerData } from '../../../../../packages/parity/src/dashboard/tracker.ts';

const statuses = [
    { id: 'all', label: 'Any status' },
    { id: 'passed', label: 'Passing' },
    { id: 'failed', label: 'Failing' },
    { id: 'not measured', label: 'Not measured' },
    { id: 'accepted', label: 'Accepted gaps' },
    { id: 'defect', label: 'Known defects' }
] as const;
const activeGroup = ref('all');
const activeStatus = ref<(typeof statuses)[number]['id']>('all');
const query = ref('');
const expanded = ref(false);
const tracker = ref<TrackerData | null>(null);
const loadError = ref(false);

const groups = computed(() => {
    const snapshot = tracker.value;
    if (snapshot === null) return [{ id: 'all', label: 'All' }];
    return [
        { id: 'all', label: 'All' },
        ...[...new Set(snapshot.families.map((family) => family.group))]
            .sort((left, right) => left.localeCompare(right, 'en'))
            .map((id) => ({ id, label: id === 'other' ? 'Other checks' : id }))
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
    const search = query.value.trim().toLocaleLowerCase();

    return snapshot.families
        .filter((family) => activeGroup.value === 'all' || family.group === activeGroup.value)
        .map((family) => ({
            ...family,
            visibleCases: family.cases.filter((entry) => {
                const matchesStatus = activeStatus.value === 'all' || entry.status === activeStatus.value;
                const searchable = [family.id, entry.title, entry.context, entry.details, entry.sourceFile]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase();
                return matchesStatus && (search === '' || searchable.includes(search));
            })
        }))
        .filter(
            (family) =>
                family.visibleCases.length > 0 ||
                (search === '' && activeStatus.value === 'all' && family.cases.length === 0)
        );
});

const selectedGroup = (id: string): void => {
    activeGroup.value = id;
};

const percentage = (passed: number, checks: number): number => (checks === 0 ? 0 : Math.round((passed / checks) * 100));
</script>

<template>
    <main v-if="tracker" class="tracker">
        <p class="tracker-intro">
            Every parity assertion and reviewed gap, grouped by behavior family. A passing check means its comparison
            ran and passed; a skipped check is never counted as progress.
        </p>

        <section class="tracker-overview" aria-label="Parity check progress">
            <div class="overview-heading">
                <div>
                    <p class="eyebrow">Current snapshot</p>
                    <h2>{{ percentage(tracker.passed, tracker.checks) }}% of checks passing</h2>
                </div>
                <span class="snapshot-date"
                    >Generated {{ tracker.generatedAt.slice(0, 10) }} · {{ tracker.sourceCommit }}</span
                >
            </div>
            <progress
                class="overall-progress"
                :value="tracker.passed"
                :max="Math.max(tracker.checks, 1)"
                :aria-label="`${tracker.passed} of ${tracker.checks} parity checks passing`"
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
                <span class="status-count accepted"
                    ><b>{{ tracker.accepted }}</b> accepted gaps</span
                >
                <span class="status-count defect"
                    ><b>{{ tracker.defects }}</b> known defects</span
                >
            </div>
        </section>

        <section class="group-picker" aria-label="Filter by family group">
            <button
                v-for="group in groups"
                :key="group.id"
                type="button"
                class="group-card"
                :class="{ active: activeGroup === group.id }"
                :aria-pressed="activeGroup === group.id"
                @click="selectedGroup(group.id)"
            >
                <span class="group-card-heading">{{ group.label }}</span>
                <span v-if="group.id === 'all'" class="group-card-progress">
                    {{ tracker.passed }}/{{ tracker.checks }} checks passing
                </span>
                <template v-else>
                    <span class="group-card-progress">
                        {{
                            tracker.families
                                .filter((family) => family.group === group.id)
                                .reduce((sum, family) => sum + family.passed, 0)
                        }}/{{
                            tracker.families
                                .filter((family) => family.group === group.id)
                                .reduce((sum, family) => sum + family.checks, 0)
                        }}
                        checks passing
                    </span>
                </template>
                <progress
                    :value="
                        group.id === 'all'
                            ? tracker.passed
                            : tracker.families
                                  .filter((family) => family.group === group.id)
                                  .reduce((sum, family) => sum + family.passed, 0)
                    "
                    :max="
                        Math.max(
                            group.id === 'all'
                                ? tracker.checks
                                : tracker.families
                                      .filter((family) => family.group === group.id)
                                      .reduce((sum, family) => sum + family.checks, 0),
                            1
                        )
                    "
                    aria-hidden="true"
                />
            </button>
        </section>

        <section class="case-list" aria-label="Parity cases">
            <div class="controls">
                <div class="status-filters" aria-label="Filter by status">
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
                    >Showing {{ visibleFamilies.reduce((sum, family) => sum + family.visibleCases.length, 0) }} of
                    {{ tracker.cases.length }} cases</span
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
                        <span class="family-count">{{ family.cases.length }} cases</span>
                    </span>
                    <span class="family-progress">
                        <span
                            >{{ family.passed }}/{{ family.checks }} passing ·
                            {{ percentage(family.passed, family.checks) }}%</span
                        >
                        <progress
                            :value="family.passed"
                            :max="Math.max(family.checks, 1)"
                            :aria-label="`${family.passed} of ${family.checks} checks passing`"
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
                </ul>
            </details>
        </section>
    </main>
    <p v-else-if="loadError" class="tracker-message">Could not load the parity tracker data. Refresh to try again.</p>
    <p v-else class="tracker-message">Loading parity tracker…</p>
</template>

<style scoped>
.tracker {
    --tracker-good: #2f855a;
    --tracker-bad: #c53030;
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
    padding: 1.35rem 1.5rem;
    border: 1px solid var(--tracker-border);
    border-radius: 14px;
    background: linear-gradient(135deg, var(--tracker-surface), var(--vp-c-bg));
}

.overview-heading,
.overview-counts,
.family-title,
.family-progress,
.results-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.overview-heading h2 {
    margin: 0.15rem 0 0;
    border: 0;
    font-size: 1.45rem;
    letter-spacing: -0.025em;
}

.eyebrow {
    margin: 0;
    color: var(--vp-c-brand-1);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.snapshot-date {
    color: var(--tracker-muted);
    font-size: 0.78rem;
    text-align: right;
}

progress {
    width: 100%;
    height: 0.55rem;
    overflow: hidden;
    border: 0;
    border-radius: 999px;
    background: var(--vp-c-bg-alt);
    accent-color: var(--tracker-good);
}

progress::-webkit-progress-bar {
    border-radius: 999px;
    background: var(--vp-c-bg-alt);
}

progress::-webkit-progress-value {
    border-radius: 999px;
    background: linear-gradient(90deg, var(--vp-c-brand-1), var(--tracker-good));
}

.overall-progress {
    margin: 1rem 0 0.7rem;
    height: 0.75rem;
}

.overview-counts {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0.55rem 1.15rem;
    font-size: 0.78rem;
}

.status-count b {
    margin-right: 0.2rem;
    font-variant-numeric: tabular-nums;
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
.accepted {
    color: #9a6700;
}

.group-picker {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    gap: 0.65rem;
    margin: 1.25rem 0 1.6rem;
}

.group-card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--tracker-border);
    border-radius: 10px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    cursor: pointer;
    text-align: left;
    transition:
        border-color 150ms ease,
        background-color 150ms ease,
        transform 150ms ease;
}

.group-card:hover {
    border-color: var(--vp-c-brand-1);
    transform: translateY(-1px);
}
.group-card.active {
    border-color: var(--vp-c-brand-1);
    background: var(--vp-c-brand-soft);
}
.group-card-heading {
    font-weight: 700;
}
.group-card-progress {
    color: var(--tracker-muted);
    font-size: 0.72rem;
}
.group-card progress {
    height: 0.35rem;
    margin-top: 0.15rem;
}

.case-list {
    border-top: 1px solid var(--tracker-border);
}

.controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 1rem 0;
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
    font-size: 0.75rem;
}

.status-filters button:hover,
.expand-toggle:hover {
    color: var(--vp-c-brand-1);
}
.status-filters button.active {
    border-color: var(--tracker-border);
    background: var(--tracker-surface);
    color: var(--vp-c-text-1);
}

.search-field {
    flex: 0 1 290px;
}
.search-field input {
    width: 100%;
    padding: 0.56rem 0.75rem;
    border: 1px solid var(--tracker-border);
    border-radius: 8px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    font: inherit;
    font-size: 0.8rem;
}

.results-heading {
    padding: 0.15rem 0 0.7rem;
    color: var(--tracker-muted);
    font-size: 0.78rem;
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
    padding: 0.85rem 0.35rem;
    cursor: pointer;
    list-style-position: inside;
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
.status-accepted {
    background: #c58b00;
}
.status-not-measured {
    background: #9097a1;
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
.status-badge.status-accepted {
    background: color-mix(in srgb, #c58b00 12%, transparent);
    color: #9a6700;
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
</style>
