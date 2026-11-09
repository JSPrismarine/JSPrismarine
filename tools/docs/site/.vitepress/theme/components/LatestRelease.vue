<script setup lang="ts">
import { withBase } from 'vitepress';

import type { Release } from '../../../releases.data.mts';

/** The newest release: its version, date and the first few new features. */
withDefaults(defineProps<{ release: Release; limit?: number }>(), { limit: 3 });
</script>

<template>
    <div class="latest-release">
        <p class="latest-release__label">Latest release</p>
        <p class="latest-release__version">
            v{{ release.version }}
            <time v-if="release.date" :datetime="release.date">{{ release.date }}</time>
        </p>
        <ul>
            <li
                v-for="change in [...release.major, ...release.minor, ...release.patch].slice(0, limit)"
                :key="change.summary"
            >
                {{ change.summary }}
            </li>
        </ul>
        <a :href="withBase('/releases')">Read the release notes</a>
    </div>
</template>

<style scoped>
.latest-release {
    display: grid;
    gap: 10px;
}

.latest-release__label {
    margin: 0;
    font: 700 12px var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.75;
}

.latest-release__version {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: baseline;
    margin: 0;
    font-size: clamp(36px, 6vw, 56px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.05em;
}

.latest-release__version time {
    font: 13px var(--vp-font-family-mono);
    letter-spacing: 0;
    opacity: 0.75;
}

.latest-release ul {
    overflow-wrap: anywhere;
    display: grid;
    gap: 6px;
    padding-left: 18px;
    margin: 0;
    font-size: 15px;
}

.latest-release li {
    margin: 0;
}

.latest-release a {
    justify-self: start;
    font-weight: 800;
    color: inherit;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
}
</style>
