<script setup lang="ts">
/**
 * Land made of the mark's triangle: a pale far range and a dark near one, seen from a window. Each range is
 * drawn twice end to end, so it can pass by without a seam. It only moves while `moving` is set, and never
 * under reduced motion.
 */
withDefaults(
    defineProps<{
        moving?: boolean;
        /** How wide the land is against its frame, in percent. A narrow frame shows fewer, wider peaks. */
        span?: number;
    }>(),
    { moving: false, span: 100 }
);

/** Peak heights of one stretch of the near range, in the range's own units. */
const nearHeights = [18, 27, 14, 23, 30, 16, 25, 12, 28, 20, 15, 26, 19, 23];
const nearTones = ['forest', 'accent', 'deep', 'accent', 'forest', 'deep'];
const farHeights = [22, 30, 18, 26, 20, 29, 24];

/**
 * The near range: one stretch of fourteen peaks, twice. A peak takes its tone from its place in the stretch,
 * so the second stretch is the first one again and the loop has no seam.
 */
const near = [...nearHeights, ...nearHeights].map((height, index) => ({
    height,
    index,
    tone: `var(--jsp-${nearTones[(index % nearHeights.length) % nearTones.length]})`
}));
/** The far range: one stretch of seven wide peaks, twice, in two pale tones. */
const far = [...farHeights, ...farHeights].map((height, index) => ({
    height,
    index,
    tone:
        (index % farHeights.length) % 2
            ? 'var(--jsp-mint)'
            : 'color-mix(in srgb, var(--jsp-mint) 68%, var(--jsp-accent))'
}));
</script>

<template>
    <div class="land" :class="{ 'is-moving': moving }" :style="{ '--land-span': `${span}%` }" aria-hidden="true">
        <div class="land__range is-far">
            <i
                v-for="peak in far"
                :key="peak.index"
                :style="{ '--i': peak.index, '--m': peak.height, '--tone': peak.tone }"
            ></i>
        </div>
        <div class="land__range">
            <i
                v-for="peak in near"
                :key="peak.index"
                :style="{ '--i': peak.index, '--m': peak.height, '--tone': peak.tone }"
            ></i>
        </div>
    </div>
</template>

<style scoped>
.land {
    position: relative;
    overflow: hidden;
}

.land__range {
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--land-span);
    animation: land-pass 26s linear infinite paused;
}

/* The far range is further off, so it passes more slowly. */
.land__range.is-far {
    animation-duration: 58s;
}

.is-moving .land__range {
    animation-play-state: running;
}

@keyframes land-pass {
    to {
        transform: translateX(-100%);
    }
}

/* One peak: the mark's triangle, a fourteenth of the range apart and wide enough to overlap its neighbors. */
.land__range i {
    position: absolute;
    bottom: 0;
    left: calc(var(--i) * 7.143% - 3%);
    width: 13%;
    height: calc(var(--m) * var(--land-rise, 3.4%));
    background: var(--tone);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.land__range.is-far i {
    left: calc(var(--i) * 14.286% - 6%);
    width: 26%;
    height: calc(var(--m) * var(--land-rise, 3.4%) * 1.45);
}

@media (prefers-reduced-motion: reduce) {
    .land__range {
        animation: none;
    }
}
</style>
