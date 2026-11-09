<script setup lang="ts">
import { withBase } from 'vitepress';

withDefaults(defineProps<{ href: string; variant?: 'primary' | 'outline' }>(), { variant: 'primary' });
</script>

<template>
    <a class="brand-button" :class="`is-${variant}`" :href="withBase(href)"><slot /></a>
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
    border-radius: 10px;
    box-shadow: 4px 4px 0 var(--jsp-cream);
    transition:
        transform 0.08s,
        box-shadow 0.08s;
}

.brand-button:hover {
    transform: translate(3px, 3px);
    box-shadow: 1px 1px 0 var(--jsp-cream);
}

.is-primary {
    color: var(--jsp-forest);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
    box-shadow: 4px 4px 0 var(--jsp-ink);
}

.is-primary:hover {
    box-shadow: 1px 1px 0 var(--jsp-ink);
}

.is-outline {
    color: var(--jsp-cream);
    background: transparent;
}
</style>
