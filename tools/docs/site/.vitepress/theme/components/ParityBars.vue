<script setup lang="ts">
import { computed } from 'vue';

import {
    behaviorProgress,
    isBehaviorFamily,
    trackerPrimaryProgressPercent,
    trackerProgressPercent
} from '../../../../../../packages/parity/src/dashboard/trackerProgress.ts';
import { groupProgress, useTrackerSnapshot } from '../parity';

/**
 * The gameplay behavior score and one bar per behavior group, counted the way the parity tracker page
 * counts them. Data table comparisons are left out: a matching table does not mean matching behavior.
 */
withDefaults(defineProps<{ limit?: number }>(), { limit: 5 });
const { tracker } = useTrackerSnapshot();

const behaviorFamilies = computed(() => tracker.value?.families.filter((family) => isBehaviorFamily(family.id)) ?? []);
const score = computed(() => {
    const { passed, tracked } = behaviorProgress(behaviorFamilies.value);
    return { passed, tracked, percent: trackerPrimaryProgressPercent(passed, tracked) };
});
const groups = computed(() =>
    groupProgress(behaviorFamilies.value)
        .filter(({ tracked }) => tracked > 0)
        .sort((left, right) => right.tracked - left.tracked)
);
</script>

<template>
    <div class="parity-bars" :aria-busy="!tracker">
        <p v-if="tracker" class="parity-bars__score">
            <strong>{{ score.percent }}%</strong>
            <span
                >{{ score.passed.toLocaleString() }} of {{ score.tracked.toLocaleString() }} behavior checks pass</span
            >
        </p>
        <div v-for="group in groups.slice(0, limit)" :key="group.id" class="parity-bars__row">
            <span class="parity-bars__label" :class="{ 'is-gap': group.passed * 2 < group.tracked }">{{
                group.label
            }}</span>
            <progress
                :value="group.passed"
                :max="group.tracked"
                :aria-label="`${group.label}: ${group.passed} of ${group.tracked} passing`"
            />
            <span>{{ trackerProgressPercent(group.passed, group.tracked) }}%</span>
        </div>
    </div>
</template>

<style scoped>
.parity-bars {
    display: grid;
    gap: 7px;
    min-height: 120px;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
}

/* A group under half passing carries the tracker's signal square. */
.parity-bars__label.is-gap::before {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    content: '';
    background: var(--jsp-signal);
}

.parity-bars__score {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    margin: 0 0 6px;
}

.parity-bars__score strong {
    font-family: var(--vp-font-family-base);
    font-size: 40px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    color: var(--jsp-accent);
}

.parity-bars__row {
    display: grid;
    grid-template-columns: 96px 1fr 48px;
    gap: 10px;
    align-items: center;
}

.parity-bars__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.parity-bars progress {
    width: 100%;
    height: 14px;
    appearance: none;
    background: var(--jsp-track);
    border: 0;
}

.parity-bars progress::-webkit-progress-bar {
    background: var(--jsp-track);
}

.parity-bars progress::-webkit-progress-value {
    background: var(--jsp-accent);
}

.parity-bars progress::-moz-progress-bar {
    background: var(--jsp-accent);
}
</style>
