<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ items: string[] }>();
/** Two identical halves let the -50% translation loop without a visible jump. */
const line = computed(() => `${props.items.join(' · ')} · `.repeat(4));
/** Moving content needs a way to stop it, for readers who have not set reduced motion. */
const paused = ref(false);
</script>

<template>
    <div class="ticker" :class="{ 'is-paused': paused }">
        <div class="ticker__track" aria-hidden="true">{{ line }}{{ line }}</div>
        <button class="ticker__toggle" type="button" :aria-pressed="paused" @click="paused = !paused">
            {{ paused ? 'Play' : 'Pause' }}
        </button>
    </div>
</template>

<style scoped>
.ticker {
    position: relative;
    padding: 12px 0;
    overflow: hidden;
    font-size: clamp(20px, 3vw, 30px);
    font-weight: 800;
    letter-spacing: -0.03em;
    white-space: nowrap;
    color: var(--jsp-accent);
    background: var(--jsp-ink);
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

/* The dark page is nearly ink, so the band takes the deep surface there to stay a distinct block. */
.dark .ticker {
    background: var(--jsp-deep);
    box-shadow: inset 0 0 0 1.5px var(--jsp-dark-edge);
}

.ticker:is(:hover, .is-paused) .ticker__track {
    animation-play-state: paused;
}

.ticker__toggle {
    position: absolute;
    top: 50%;
    right: 10px;
    min-height: 32px;
    padding: 0 12px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-ink);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    background: var(--jsp-accent);
    border-radius: 99px;
    transform: translateY(-50%);
}

@media (prefers-reduced-motion: reduce) {
    .ticker__track {
        animation: none;
    }

    /* Nothing moves, so there is nothing to pause. */
    .ticker__toggle {
        display: none;
    }
}
</style>
