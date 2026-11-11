<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        href: string; /** `outline` sits on forest or ink; `secondary` sits on the page background. */
        variant?: 'primary' | 'outline' | 'secondary';
    }>(),
    { variant: 'primary' }
);
/** Site paths get the deploy base; full URLs are left alone. */
const target = computed(() => (/^[a-z]+:/i.test(props.href) ? props.href : withBase(props.href)));
</script>

<template>
    <a class="brand-button" :class="`is-${variant}`" :href="target"><slot /></a>
</template>

<style scoped>
.brand-button {
    display: inline-block;
    padding: 13px 22px;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.2;
    text-decoration: none;
    border: 2px solid var(--jsp-cream);
    border-radius: var(--jsp-radius-control);
    box-shadow: var(--jsp-shadow-offset) var(--jsp-shadow-offset) 0 var(--jsp-cream);
    transition:
        transform 0.08s,
        box-shadow 0.08s;
}

.brand-button:is(:hover, :active) {
    transform: translate(3px, 3px);
    box-shadow: 1px 1px 0 var(--jsp-cream);
}

.brand-button:active {
    transform: translate(var(--jsp-shadow-offset), var(--jsp-shadow-offset));
    box-shadow: none;
}

.is-primary {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
    /* Ink by default; dark surfaces set --jsp-primary-shadow so the primary shadow never fades out there. */
    box-shadow: var(--jsp-shadow-offset) var(--jsp-shadow-offset) 0 var(--jsp-primary-shadow, var(--jsp-ink));
}

.is-primary:hover {
    box-shadow: 1px 1px 0 var(--jsp-primary-shadow, var(--jsp-ink));
}

.is-primary:focus-visible {
    box-shadow:
        var(--jsp-shadow-offset) var(--jsp-shadow-offset) 0 var(--jsp-primary-shadow, var(--jsp-ink)),
        0 0 0 2px var(--jsp-ink);
}

.is-outline {
    color: var(--jsp-cream);
    background: transparent;
}

/* Secondary actions keep the hard shadow at half depth, so the primary action stays the loudest. */
:is(.is-outline, .is-secondary) {
    --jsp-shadow-offset: 2px;
}

.is-secondary {
    color: var(--vp-c-text-1);
    background: transparent;
    border-color: var(--vp-c-text-1);
    box-shadow: var(--jsp-shadow-offset) var(--jsp-shadow-offset) 0 var(--vp-c-text-1);
}

.is-secondary:hover {
    box-shadow: 1px 1px 0 var(--vp-c-text-1);
}

@media (prefers-reduced-motion: reduce) {
    .brand-button {
        transition: none;
    }
}
</style>
