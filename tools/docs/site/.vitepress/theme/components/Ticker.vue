<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ items: string[] }>();
/** Two identical halves let the -50% translation loop without a visible jump. */
const line = computed(() => `${props.items.join(' · ')} · `.repeat(4));
</script>

<template>
    <div class="ticker" aria-hidden="true">
        <div class="ticker__track">{{ line }}{{ line }}</div>
    </div>
</template>

<style scoped>
.ticker {
    padding: 12px 0;
    overflow: hidden;
    font-size: clamp(20px, 3vw, 30px);
    font-weight: 800;
    letter-spacing: -0.03em;
    white-space: nowrap;
    color: var(--jsp-forest);
    background: var(--jsp-accent);
    border-radius: var(--jsp-radius-panel);
}

.ticker__track {
    display: inline-block;
    animation: ticker 40s linear infinite;
}

@keyframes ticker {
    to {
        transform: translateX(-50%);
    }
}

@media (prefers-reduced-motion: reduce) {
    .ticker__track {
        animation: none;
    }
}
</style>
