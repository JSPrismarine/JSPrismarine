<script setup lang="ts">
/** The JSPrismarine prism: three flat facets and a signal core. Drawn here so it is never redrawn elsewhere. */
withDefaults(defineProps<{ size?: number | string; solid?: boolean }>(), { size: 32, solid: false });
</script>

<template>
    <svg class="prism-mark" :width="size" :height="size" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="50,4 96,86 4,86" class="prism-mark__base" />
        <polygon points="50,4 50,86 4,86" fill="var(--jsp-accent)" />
        <polygon points="50,4 96,86 50,86" fill="var(--jsp-mint)" />
        <polygon points="50,52 72,86 28,86" fill="var(--jsp-signal)" />
    </svg>
</template>

<style scoped>
.prism-mark__base {
    fill: var(--jsp-forest);
}

:global(.dark) .prism-mark__base {
    fill: var(--jsp-deep);
}
</style>
