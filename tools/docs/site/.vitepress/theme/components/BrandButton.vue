<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';

const props = withDefaults(defineProps<{ href: string; variant?: 'primary' | 'outline' }>(), { variant: 'primary' });
/** Site paths get the deploy base; full URLs are left alone. */
const target = computed(() => (/^[a-z]+:/i.test(props.href) ? props.href : withBase(props.href)));
</script>

<template>
    <a class="brand-button" :class="`is-${variant}`" :href="target"><slot /></a>
</template>

<style scoped>
.brand-button {
    display: inline-block;
    padding: 12px 20px;
    font-size: 16px;
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
    color: var(--jsp-forest);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
    box-shadow: var(--jsp-shadow-offset) var(--jsp-shadow-offset) 0 var(--jsp-ink);
}

.is-primary:hover {
    box-shadow: 1px 1px 0 var(--jsp-ink);
}

.is-outline {
    color: var(--jsp-cream);
    background: transparent;
}

@media (prefers-reduced-motion: reduce) {
    .brand-button {
        transition: none;
    }
}
</style>
