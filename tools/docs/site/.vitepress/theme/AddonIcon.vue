<script setup lang="ts">
import { withBase } from 'vitepress';

/** An addon's pack icon on a cream tile, or its title's first letter when the pack has none. */
defineProps<{ src?: string; title: string; size: number }>();
</script>

<template>
    <span class="addon-icon" :style="{ '--addon-icon-size': `${size}px` }" aria-hidden="true">
        <img v-if="src" :src="withBase(src)" alt="" loading="lazy" />
        <span v-else>{{ title.slice(0, 1) }}</span>
    </span>
</template>

<style scoped>
.addon-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--addon-icon-size);
    height: var(--addon-icon-size);
    overflow: hidden;
    font-size: calc(var(--addon-icon-size) / 2);
    font-weight: 800;
    color: var(--jsp-forest);
    background: var(--jsp-cream);
    border: 1px solid color-mix(in srgb, var(--jsp-ink) 18%, transparent);
    border-radius: var(--jsp-radius-control);
}

/* Pack icons are pixel art; scaling keeps their edges. */
.addon-icon img {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
}
</style>
