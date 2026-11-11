<script setup lang="ts">
/** A solid block for a short claim. `span` is the number of the grid's six columns it covers. */
withDefaults(defineProps<{ tone?: 'accent' | 'signal' | 'deep' | 'forest'; span?: 2 | 3 | 4 | 6 }>(), {
    tone: 'forest',
    span: 3
});
</script>

<template>
    <div class="bento-tile" :class="[`is-${tone}`, `span-${span}`]"><slot /></div>
</template>

<style scoped>
.bento-tile {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 22px;
    container-type: inline-size;
    color: var(--jsp-cream);
    border-radius: var(--jsp-radius-panel);
}

.is-accent {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
}

.is-signal {
    color: var(--jsp-ink);
    background: var(--jsp-signal);
}

.is-deep {
    background: var(--jsp-deep);
}

.is-forest {
    background: var(--jsp-forest);
}

.span-2 {
    grid-column: span 2;
}

.span-3 {
    grid-column: span 3;
}

.span-4 {
    grid-column: span 4;
}

.span-6 {
    grid-column: span 6;
}

.bento-tile :deep(.bento-figure) {
    /* Sized to the tile, so a five-digit figure still fits a narrow one. */
    font-size: min(104px, 26cqi);
    font-weight: 800;
    line-height: 0.85;
    letter-spacing: -0.06em;
}

/* A figure with dots in it, such as a version, opens its tracking up so the dots stay visible. */
.bento-tile :deep(.bento-figure.is-dotted) {
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
}

.bento-tile :deep(.bento-caption) {
    max-width: 42ch;
    margin: 0;
    font-size: 15px;
    /* No word alone on a caption's last line. */
    text-wrap: pretty;
}

/*
 * A tile's last block sits on its bottom edge, so the space falls between blocks. A caption under a figure
 * stays with it, so figures and their captions line up across a row.
 */
.bento-tile > :deep(:last-child:not(:first-child, .bento-figure + *)) {
    margin-top: auto;
}

.bento-tile :deep(.bento-caption b) {
    display: block;
    margin-bottom: 3px;
    font-size: 18px;
}

@media (max-width: 700px) {
    .bento-tile {
        grid-column: 1 / -1;
    }
}
</style>
