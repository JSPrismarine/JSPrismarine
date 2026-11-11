<script setup lang="ts">
import { withBase } from 'vitepress';

import { computed } from 'vue';

import type { Release } from '../../../releases.data.mts';
import { releaseAnchor } from '../releases';

/** The newest release: its version, date and the first few new features. */
const props = withDefaults(defineProps<{ release: Release; limit?: number }>(), { limit: 3 });
/** Changes an upgrader has to act on, which the tile points to rather than lists. */
const breaking = computed(
    () =>
        [...props.release.major, ...props.release.minor, ...props.release.patch].filter((change) => change.breaking)
            .length
);
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
        <p class="latest-release__links">
            <a :href="withBase('/releases')">Read the release notes</a>
            <a v-if="breaking" :href="withBase(`/releases#${releaseAnchor(release.version)}`)"
                >{{ breaking }} breaking, read before upgrading</a
            >
        </p>
    </div>
</template>

<style scoped>
.latest-release {
    display: grid;
    gap: 10px;
}

.latest-release__label {
    margin: 0;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.12em;
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
    /* A version has dots, which tighter tracking would close up. */
    letter-spacing: -0.03em;
}

.latest-release__version time {
    font: 13px var(--vp-font-family-mono);
    letter-spacing: 0;
}

.latest-release ul {
    overflow-wrap: anywhere;
    display: grid;
    gap: 6px;
    max-width: 72ch;
    padding: 0;
    margin: 0;
    font-size: 15px;
    list-style: none;
}

/* A solid rule marks each change and keeps the list on the heading's left edge. */
.latest-release li {
    padding-left: 12px;
    margin: 0;
    border-left: 3px solid currentColor;
}

/* In a wide tile the version and link stand left and the changes take the right, so the tile has no empty half. */
@container (min-width: 720px) {
    .latest-release {
        grid-template-areas:
            'label list'
            'version list'
            'link list';
        grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
        grid-template-rows: auto auto 1fr;
        column-gap: 40px;
    }

    .latest-release__label {
        grid-area: label;
    }

    .latest-release__version {
        grid-area: version;
    }

    .latest-release ul {
        grid-area: list;
        align-self: center;
        font-size: 16px;
    }

    .latest-release__links {
        grid-area: link;
        align-self: end;
    }
}

.latest-release__links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
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
