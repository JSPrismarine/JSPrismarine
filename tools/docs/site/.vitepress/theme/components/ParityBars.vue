<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, onMounted, ref } from 'vue';

import type { TrackerData } from '../../../../../../packages/parity/src/dashboard/tracker.ts';

export interface ParityRow {
    label: string;
    /** Percent from 0 to 100. */
    value: number;
}

const props = withDefaults(defineProps<{ rows?: ParityRow[]; limit?: number }>(), { limit: 5 });
const tracker = ref<TrackerData | null>(null);

onMounted(async () => {
    if (props.rows) return;
    try {
        const response = await fetch(withBase('/parity-tracker.json'));
        if (response.ok) tracker.value = await response.json();
    } catch {
        // The snapshot is only staged by `docs:stage`; without it the bars stay empty.
    }
});

/** One bar per tracker group: the share of its checks that pass, largest groups first. */
const shown = computed<ParityRow[]>(() => {
    if (props.rows) return props.rows.slice(0, props.limit);
    const groups = new Map<string, { passed: number; checks: number }>();
    for (const family of tracker.value?.families ?? []) {
        const total = groups.get(family.group) ?? { passed: 0, checks: 0 };
        total.passed += family.passed;
        total.checks += family.checks;
        groups.set(family.group, total);
    }
    return [...groups]
        .filter(([, { checks }]) => checks > 0)
        .sort(([, a], [, b]) => b.checks - a.checks)
        .slice(0, props.limit)
        .map(([label, { passed, checks }]) => ({ label, value: Math.floor((passed / checks) * 100) }));
});
</script>

<template>
    <div class="parity-bars">
        <div v-for="row in shown" :key="row.label" class="parity-bars__row">
            <span class="parity-bars__label">{{ row.label }}</span>
            <i :style="{ '--w': `${row.value}%` }"></i>
            <span>{{ row.value }}%</span>
        </div>
    </div>
</template>

<style scoped>
.parity-bars {
    display: grid;
    gap: 7px;
    min-height: 100px;
    font: 12px var(--vp-font-family-mono);
}

.parity-bars__row {
    display: grid;
    grid-template-columns: 110px 1fr 40px;
    gap: 10px;
    align-items: center;
}

.parity-bars__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.parity-bars i {
    position: relative;
    display: block;
    height: 14px;
    background: #0a4a38;
}

.parity-bars i::after {
    position: absolute;
    inset: 0;
    width: var(--w);
    content: '';
    background: var(--jsp-accent);
}
</style>
