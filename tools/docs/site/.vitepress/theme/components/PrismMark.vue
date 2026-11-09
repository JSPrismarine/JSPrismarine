<script setup lang="ts">
import { facets } from '../prism';

/** The JSPrismarine mark. The geometry lives in `prism.ts`, so this and the favicon never drift apart. */
withDefaults(defineProps<{ size?: number | string }>(), { size: 32 });
</script>

<template>
    <svg class="prism-mark" :width="size" :height="size" viewBox="0 0 100 100" aria-hidden="true">
        <template v-for="facet in facets" :key="facet.points">
            <polygon :points="facet.points" :fill="`var(--jsp-${facet.color})`" />
            <polygon v-if="facet.shade" :points="facet.points" fill="var(--jsp-ink)" :fill-opacity="facet.shade" />
        </template>
    </svg>
</template>
